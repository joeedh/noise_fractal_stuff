import {UIBase, Vector2, util, ToolProperty} from '../path.ux/pathux.js';

export class SlidersWidget extends UIBase {
  constructor() {
    super();

    this.sliderDef = [];

    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");
    this.shadow.appendChild(this.canvas);
  }

  static define() {
    return {
      tagname: "sliders-widget-x",
      style  : "sliders-widget"
    }
  }

  init() {
    super.init();
  }

  setCSS() {
    super.setCSS();
  }

  update() {
    super.update();
  }
}

UIBase.register(SlidersWidget);
