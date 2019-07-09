import { DomItem } from "./DomItem";
import { Length } from "../unit/Length";

export class ArtBoard extends DomItem {
  getDefaultObject(obj = {}) {
    return super.getDefaultObject({
      itemType: "artboard",
      name: "New ArtBoard",
      width: Length.px(1000),
      height: Length.px(1000),
      'background-color': 'white',
      ...obj
    });
  }

  toCloneObject() {
    return {
      ...super.toCloneObject(),
      name: this.json.name 
    }
  }  

  getDefaultTitle() {
    return "ArtBoard";
  }

  checkInAreaForLayers(area) {
    return this.layers.filter(layer => {
      return layer.checkInArea(area);
    })
  }

  toDefaultCSS() {
    return {
      ...super.toDefaultCSS(),
      // 'overflow': 'hidden'
    }
  }

}
