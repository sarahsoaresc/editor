import { Length } from "../unit/Length";
import { Property } from "../items/Property";
import { convertMatches } from "../../util/functions/parser";

export class TextShadow extends Property {
  static parse(obj) {
    return new TextShadow(obj);
  }

  static parseStyle (str) {
    var results = convertMatches(str);

    var textShadows = results.str.split(",").filter(it => it.trim()).map(shadow => {
      var values = shadow.split(" ");

      var colors = values
        .filter(it => it.includes("@"))
        .map(it => {
          return results.matches[+it.replace("@", "")].color;
        });

      var numbers = values.filter(it => {
        return it !== "inset" && !it.includes("@");
      });

      return TextShadow.parse({
        color: colors[0] || "rgba(0, 0, 0, 1)",
        offsetX: Length.parse(numbers[0] || "0px"),
        offsetY: Length.parse(numbers[1] || "0px"),
        blurRadius: Length.parse(numbers[2] || "0px")
      });
    });

    return textShadows;
  }

  getDefaultObject() {
    return super.getDefaultObject({
      itemType: "text-shadow",
      offsetX: Length.px(0),
      offsetY: Length.px(0),
      blurRadius: Length.px(0),
      color: "rgba(0, 0, 0, 1)"
    });
  }

  toCSS() {
    return {
      "text-shadow": this.toString()
    };
  }

  toString() {
    var json = this.json;

    return `${json.offsetX} ${json.offsetY} ${json.blurRadius} ${json.color}`;
  }
}
