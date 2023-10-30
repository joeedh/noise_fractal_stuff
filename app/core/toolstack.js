import {ToolStack} from '../path.ux/pathux.js';
import {taskManager} from './task.js';

export class AppToolStack extends ToolStack {
  constructor() {
    super(...arguments);

    this.savedPos = this.cur;
  }

  reset() {
    super.reset(...arguments);
    this.savedPos = -1;
  }

  get fileModified() {
    return this.savedPos !== this.cur;
  }

  onFileSaved() {
    this.savedPos = this.cur;
  }

  execTool() {
    return super.execTool(...arguments);
  }
}
