import {ToolStack} from '../path.ux/pathux.js';
import {taskManager} from './task.js';

export class AppToolStack extends ToolStack {
  execTool() {
    return super.execTool(...arguments);
  }
}
