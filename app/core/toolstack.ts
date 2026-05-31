import {ToolStack} from '../path.ux/scripts/pathux.js';
import {taskManager} from './task.js';
import type {ToolContext} from './context.js';
import type {ToolOp, ToolOpAny} from '../path.ux/scripts/pathux.js';

export class AppToolStack extends ToolStack<ToolContext> {
  savedPos: number

  constructor(ctx?: ToolContext) {
    super(ctx);

    this.savedPos = this.cur;
  }

  reset(ctx?: ToolContext) {
    super.reset(ctx);
    this.savedPos = -1;
  }

  get fileModified() {
    return this.savedPos !== this.cur;
  }

  onFileSaved() {
    this.savedPos = this.cur;
  }

  execTool(ctx: ToolContext, toolop: ToolOp | ToolOpAny, event?: PointerEvent) {
    return super.execTool(ctx, toolop, event);
  }
}
