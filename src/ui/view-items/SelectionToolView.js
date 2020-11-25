import UIElement, { EVENT } from "@core/UIElement";
import { POINTERSTART, MOVE, END, IF } from "@core/Event";
import { Length } from "@unit/Length";
import { clone, isNotUndefined } from "@core/functions/func";
import GuideView from "../view/GuideView";
import { mat4, vec3 } from "gl-matrix";
import { Transform } from "@property-parser/Transform";
import { TransformOrigin } from "@property-parser/TransformOrigin";
import { calculateAngle, calculateAngleForVec3, calculateAnglePointDistance, calculateMatrix, calculateMatrixInverse, degreeToRadian, radianToDegree } from "@core/functions/math";


var directionType = {
    1: 'to top left',
    2: 'to top right',
    3: 'to bottom right',
    4: 'to bottom left',
}

const SelectionToolEvent = class  extends UIElement {

    [EVENT('hideSelectionToolView')] () {
        
    }

    [EVENT('hideSubEditor')] (e) {
        this.toggleEditingPath(false);
    }

    [EVENT('openPathEditor')] () {
        var current = this.$selection.current;
        if (current && current.isSVG() && current.d) {
            this.toggleEditingPath(true);

            // box 모드 
            // box - x, y, width, height 고정된 상태로  path 정보만 변경 
            this.emit('showPathEditor', 'modify', {
                current,
                d: current.accumulatedPath().d,
            }) 
        }
    }

    [EVENT('finishPathEdit')] () {
        this.toggleEditingPath(false);
    }


    [EVENT('refreshSelectionTool')] () { 
        this.initSelectionTool();
    }
}

/**
 * 원보 아이템의 크기를 가지고 scale 이랑 조합해서 world 의 크기를 구하는게 기본 컨셉 
 */
export default class SelectionToolView extends SelectionToolEvent {

    initialize() {
        super.initialize();

        this.guideView = new GuideView(this.$editor, this);
    }

    template() {
        return /*html*/`
    <div class='selection-view one-selection-view' ref='$selectionView' style='display:none' >
        <div class='pointer-rect' ref='$pointerRect'></div>        
    </div>`
    }

    toggleEditingPath (isEditingPath) {
        this.refs.$selectionTool.toggleClass('editing-path', isEditingPath);
    }
    
    checkEditMode () {
        return this.$editor.isSelectionMode(); 
    }

    [POINTERSTART('$pointerRect .rotate-pointer') + MOVE('rotateVertext') + END('rotateEndVertext')] (e) {
        this.state.moveType = 'rotate'; 

        // 혼자 돌 때랑 
        // 그룹으로 돌 때랑 구조가 다르다.  
        // 어떻게 맞추나 

        this.$selection.doCache();

        this.$selection.reselect();            
        this.verties = clone(this.$selection.verties);

    }

    rotateVertext (dx, dy) {

        var distAngle = Math.floor(calculateAngleForVec3(this.verties[4], this.verties[5], [dx, dy, 0]));

        this.$selection.cachedItemVerties.forEach(item => {
            const instance = this.$selection.get(item.id)

            if (instance) {
                instance.reset({
                    transform: Transform.addTransform(item.transform, `rotateZ(${Length.deg(distAngle)})`) 
                })
            }

        })

        this.renderPointers();
        this.emit('refreshCanvasForPartial', null, true)                
    }

    rotateEndVertext (dx, dy) {

        // 마지막 변경 시점 업데이트 
        this.verties = null;
    }


    [POINTERSTART('$pointerRect .pointer') + MOVE('moveVertext') + END('moveEndVertext')] (e) {
        const num = +e.$dt.attr('data-number')
        const direction =  directionType[`${num}`];
        this.state.moveType = direction; 
        this.state.moveTarget = num; 

        this.$selection.doCache();

        this.$selection.reselect();            
        this.verties = this.$selection.verties;

    }

    calculateNewOffsetMatrixInverse (vertextOffset, width, height, origin, itemMatrix) {

        const center = vec3.add(
            [], 
            TransformOrigin.scale(origin,width, height), 
            vec3.negate([], vertextOffset)
        );

        return calculateMatrixInverse(
            mat4.fromTranslation([], vertextOffset),
            mat4.fromTranslation([], center),
            itemMatrix,
            mat4.fromTranslation([], vec3.negate([], center)),
        );        
    }

    calculateDistance (vertext, dx, dy, reverseMatrix) {
        // 1. 움직이는 vertext 를 구한다. 
        const currentVertext = vec3.clone(vertext);

        // 2. dx, dy 만큼 옮긴 vertext 를 구한다.             
        const nextVertext = vec3.add([], currentVertext, [dx, dy, 0]);

        // 3. invert matrix 를 실행해서  기본 좌표로 복귀한다.             
        var currentResult = vec3.transformMat4([], currentVertext, reverseMatrix); 
        var nextResult = vec3.transformMat4([], nextVertext, reverseMatrix); 

        // 4. 복귀한 좌표에서 차이점을 구한다. 
        var realDx = (nextResult[0] - currentResult[0])/this.$editor.scale
        var realDy = (nextResult[1] - currentResult[1])/this.$editor.scale
        
        return [realDx, realDy, 0]
    }

    moveItem (instance, lastStartVertext, newWidth, newHeight) {

        if (instance) {
            instance.reset({
                x: Length.px(lastStartVertext[0] + (newWidth < 0 ? newWidth : 0)),
                y: Length.px(lastStartVertext[1] + (newHeight < 0 ? newHeight : 0)),
                width: Length.px(Math.abs(newWidth)),
                height: Length.px(Math.abs(newHeight)),
            })    
            instance.recover();     
        }

    }

    moveBottomRightVertext (dx, dy) {
        const verties = this.verties;
        if (verties) {

            this.$selection.cachedItemVerties.forEach(item => {
                const [realDx, realDy] = this.calculateDistance(
                    item.verties[2],    // bottom right 
                    dx, dy, 
                    item.accumulatedMatrixInverse
                );
    
                // 변형되는 넓이 높이 구하기 
                const newWidth = item.width + realDx;
                const newHeight = item.height + realDy;
    
                // 마지막 offset x, y 를 구해보자. 
                const view = calculateMatrix(
                    item.directionMatrix['to top left'],
                    this.calculateNewOffsetMatrixInverse (
                        [0, 0, 0], 
                        newWidth, newHeight, 
                        item.originalTransformOrigin, 
                        item.itemMatrix
                    )
                );
    
                const lastStartVertext = mat4.getTranslation([], view);
    
                this.moveItem (this.$selection.get(item.id), lastStartVertext, newWidth, newHeight);
            })


        }
    }


    moveTopRightVertext (dx, dy) {
        const item = this.$selection.cachedItemVerties[0]
        if (item) {


            const [realDx, realDy] = this.calculateDistance(
                item.verties[1],    // top right 
                dx, dy, 
                item.accumulatedMatrixInverse
            );

            // 변형되는 넓이 높이 구하기 
            const newWidth = item.width + realDx;
            const newHeight = item.height - realDy;

            // 마지막 offset x, y 를 구해보자. 
            const view = calculateMatrix(
                item.directionMatrix['to bottom left'],
                this.calculateNewOffsetMatrixInverse (
                    [0, newHeight, 0], 
                    newWidth, newHeight, 
                    item.originalTransformOrigin, 
                    item.itemMatrix
                )
            );            

            const lastStartVertext = mat4.getTranslation([], view);         

            this.moveItem (this.$selection.items[0], lastStartVertext, newWidth, newHeight);                
        }
    }


    moveTopLeftVertext (dx, dy) {
        const item = this.$selection.cachedItemVerties[0]
        if (item) {


            const [realDx, realDy] = this.calculateDistance(
                item.verties[0],    // top left 
                dx, dy, 
                item.accumulatedMatrixInverse
            );

            // 변형되는 넓이 높이 구하기 
            const newWidth = item.width - realDx;
            const newHeight = item.height - realDy;            

            // 마지막 offset x, y 를 구해보자. 
            const view = calculateMatrix(
                item.directionMatrix['to bottom right'],
                this.calculateNewOffsetMatrixInverse (
                    [newWidth, newHeight, 0], 
                    newWidth, newHeight, 
                    item.originalTransformOrigin, 
                    item.itemMatrix
                )
            );            

            const lastStartVertext = mat4.getTranslation([], view);         

            this.moveItem (this.$selection.items[0], lastStartVertext, newWidth, newHeight);
        }
    }


    moveBottomLeftVertext (dx, dy) {
        const item = this.$selection.cachedItemVerties[0]
        if (item) {

            const [realDx, realDy] = this.calculateDistance(
                item.verties[3],    // bottom left
                dx, dy, 
                item.accumulatedMatrixInverse
            );

            // 변형되는 넓이 높이 구하기 
            const newWidth = item.width - realDx;
            const newHeight = item.height + realDy;


            // 마지막 offset x, y 를 구해보자. 
            const view = calculateMatrix(
                item.directionMatrix['to top right'],
                this.calculateNewOffsetMatrixInverse (
                    [newWidth, 0, 0], 
                    newWidth, newHeight, 
                    item.originalTransformOrigin, 
                    item.itemMatrix
                )
            );            

            const lastStartVertext = mat4.getTranslation([], view);         

            this.moveItem (this.$selection.items[0], lastStartVertext, newWidth, newHeight);            
        }
    }


    moveVertext (dx, dy) {

        if (this.state.moveType === 'to bottom right') {        // 2
            this.moveBottomRightVertext(dx, dy);
        } else if (this.state.moveType === 'to top right') {
            this.moveTopRightVertext(dx, dy);
        } else if (this.state.moveType === 'to top left') {
            this.moveTopLeftVertext(dx, dy);
        } else if (this.state.moveType === 'to bottom left') {
            this.moveBottomLeftVertext(dx, dy);                                
        }    

        this.renderPointers();
        this.emit('refreshCanvasForPartial', null, true)                
    }

    moveEndVertext (dx, dy) {
        this.$selection.reselect();
    }

    [POINTERSTART('$selectionView .selection-tool-item') + IF('checkEditMode') + MOVE() + END()] (e) {
        // this.parent.selectCurrent(...this.$selection.items)

        this.$selection.doCache();

        this.initSelectionTool();
    }

    move (dx, dy) {

        var e = this.$config.get('bodyEvent');


        if (e.shiftKey) {
            dy = dx; 
        }

        this.refreshSelectionToolView(dx, dy);
        // this.parent.updateRealPosition();    
        this.emit('refreshCanvasForPartial', null, true)     
    }

    end () {
        this.refs.$selectionTool.attr('data-selected-position', '');
        this.refs.$selectionTool.attr('data-selected-movetype', '');

        this.emit('refreshAllElementBoundSize');
        this.emit('removeGuideLine')


        this.nextTick(() => {
            this.command(
                'setAttributeForMulti', 
                'move selection pointer',
                this.$selection.cloneValue('x', 'y', 'width', 'height')
            );  
        })

    }   

    refreshSelectionToolView (dx, dy, type) {
        if (dx === 0 && dy === 0) {
            // console.log(' not moved', dx, dy)
        } else {
            this.guideView.move(type || this.pointerType, dx / this.$editor.scale,  dy / this.$editor.scale )

            var drawList = this.guideView.calculate();
            this.emit('refreshGuideLine', this.calculateWorldPositionForGuideLine(drawList));            
        }
 
        this.makeSelectionTool();        

    }

    getSelectedElements() {
        const elements = this.$selection.ids.map(id => this.parent.state.cachedCurrentElement[id])
        
        return elements;
    }

    initSelectionTool() {
        this.$selection.reselect();


        this.guideView.makeGuideCache();        

        if (this.$editor.isSelectionMode() && this.$el.isHide() && this.$selection.isOne) {
            this.$el.show();
        } else {
            if (this.$el.isShow() && this.$selection.isMany) this.$el.hide();
        }

        this.makeSelectionTool();

    }      

    makeSelectionTool() {

        // selection 객체는 하나만 만든다. 
        this.guideView.recoverAll();

        this.renderPointers();

    }
    
    calculateWorldPositionForGuideLine (list = []) {
        return list.map(it => {

            var A = this.calculateWorldPosition(it.A)
            var B = this.calculateWorldPosition(it.B)

            var ax, bx, ay, by; 

            if (isNotUndefined(it.ax)) { ax = it.ax * this.$editor.scale }
            if (isNotUndefined(it.bx)) { bx = it.bx * this.$editor.scale }
            if (isNotUndefined(it.ay)) { ay = it.ay * this.$editor.scale }
            if (isNotUndefined(it.by)) { by = it.by * this.$editor.scale }

            return { A,  B, ax,  bx, ay, by}
        })
    }

    calculateWorldPosition (item) {
        return {
            x: item.x * this.$editor.scale,
            y: item.y * this.$editor.scale,
            width: item.width  *  this.$editor.scale,
            height: item.height  * this.$editor.scale,
        }
    }

    /**
     * 선택영역 컴포넌트 그리기 
     */
    renderPointers () {

        const verties = this.$selection.verties;
    
        const {line, point} = this.createRenderPointers(verties);
        this.refs.$pointerRect.updateDiff(line + point)
    }


    createPointer (pointer, number) {
        return /*html*/`
        <div class='pointer' data-number="${number}" style="transform: translate3d( calc(${pointer[0]}px - 50%), calc(${pointer[1]}px - 50%), 0px)" ></div>
        `
    }

    createRotatePointer (pointer, number) {
        if (pointer.length === 0) return '';        
        return /*html*/`
        <div class='rotate-pointer' data-number="${number}" style="transform: translate3d( calc(${pointer[0]}px - 50%), calc(${pointer[1]}px - 50%), 0px)" ></div>
        `
    }    

    createPointerRect (pointers) {
        if (pointers.length === 0) return '';

        return /*html*/`
        <svg class='line' overflow="visible">
            <path 
                d="M ${pointers[0][0]}, ${pointers[0][1]} L ${pointers[1][0]}, ${pointers[1][1]} L ${pointers[2][0]}, ${pointers[2][1]} L ${pointers[3][0]}, ${pointers[3][1]} Z" />
        </svg>`
    }    

    createRenderPointers(pointers) {
        return {
            line: this.createPointerRect(pointers), 
            point: [
                this.createPointer (pointers[0], 1),
                this.createPointer (pointers[1], 2),
                this.createPointer (pointers[2], 3),
                this.createPointer (pointers[3], 4),
                this.createRotatePointer (pointers[4], 5),                
            ].join('')
        }
    }

    [EVENT('refreshSelectionStyleView')] () {
        this.renderPointers()
    }
    
} 