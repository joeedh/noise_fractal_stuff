let _undostack = undefined;

define(["util"], function(util) {
  let exports = _undostack = {};
  
  let UndoItem = exports.UndoItem = class UndoItem {
    constructor(type, data, undo, redo) {
      this.type = type;
      this.data = data;
      
      this._undo = undo;
      this._redo = redo;
    }
    
    undo() {
      this._undo(this.data);
    }
    
    redo() {
      this._redo(this.data);
    }
  }
  
  let UndoStack = exports.UndoStack = class UndoStack extends Array {
    constructor() {
      super();
      
      this.cur = 0;
      
      this.onundo = null;
      this.onredo = null;
      this.onpush = null;
    }
    
    push(type, data, undo, redo) {
      if (this.onpush) {
        this.onpush(this);
      }
      
      this.length = this.cur;
      this.cur++;
      
      super.push(new UndoItem(type, data, undo, redo));
    }
    
    pushSwapper(type, data, swapcb) {
      function undo(data) {
        swapcb(data);
      }
      
      function redo(data) {
        swapcb(data);
      }
      
      return this.push(type, data, undo, redo);
    }
    
    undo() {
      if (this.cur <= 0) {
        return;
      }
      
      this.cur--;
      this[this.cur].undo()

      if (this.onundo) {
        this.onundo(this);
      }
    }
    
    redo() {
      if (this.cur >= this.length) {
        return;
      }
      
      this[this.cur].redo();      
      this.cur++;

      if (this.onredo) {
        this.onredo(this);
      }
    }
    
    get head() {
      return this.cur >= 0 && this.cur <= this.length ? this[this.cur - 1] : undefined;
    }
  }
  
  return exports;
});