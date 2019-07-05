import BaseProperty from "./BaseProperty";
import { editor } from "../../../../../editor/editor";
import { EVENT } from "../../../../../util/UIElement";


export default class FontSpacingProperty extends BaseProperty {

  getTitle() {
    return "Spacing";
  }

  [EVENT('refreshSelection')]() {
    this.refresh();
  }

  refresh() {
    // TODO: 업데이트를 어떻게 할까? 
  }

  getBody() {
    return `
      <div class="property-item font-item">
        <RangeEditor ref='$letter' label='Letter' removable='true' key="letter-spacing" onchange="changeRangeEditor" />
      </div>

      <div class="property-item font-item">
        <RangeEditor ref='$word' label='Word' removable='true' key="word-spacing" onchange="changeRangeEditor" />
      </div>

      <div class="property-item font-item">
        <RangeEditor ref='$indent' label='Indent' removable='true' key="text-indent" onchange="changeRangeEditor" />
      </div>      
    `;
  }

  [EVENT('changeRangeEditor')] (key, value) {

    editor.selection.reset({ 
      [key]: value
    })

    this.emit("refreshSelectionStyleView");
  }

}
