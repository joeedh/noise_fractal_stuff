import {Vector2, util, math} from '../path.ux/scripts/pathux.js';

export const TaskFlags = {
  UNIQUE : 1
};

export class Task {
  name: string
  id: number
  flag: number
  interval: number
  timerid: number | undefined
  iter: Iterator<void> | undefined
  dead: boolean
  started: boolean
  manager: TaskManager | undefined

  constructor(name: string, interval = 15) {
    this.name = name;

    this.id = -1;
    this.flag = 0;
    this.interval = interval;
    this.timerid = undefined;
    this.iter = undefined;
    this.dead = false;
    this.started = false;
    this.manager = undefined;
  }

  unique() {
    this.flag |= TaskFlags.UNIQUE;

    return this;
  }

  start(iterable?: Iterable<void>) {
    this.started = true;

    if (this.flag & TaskFlags.UNIQUE && this.manager) {
      for (let task of new Set(this.manager.tasks)) {
        if (task !== this && task.name === this.name) {
          task.stop();
          this.manager.removeTask(task);
        }
      }
    }

    if (iterable) {
      this.iter = iterable[Symbol.iterator]();
    }

    return new Promise((accept, reject) => {
      this.timerid = window.setInterval(() => {
        if (!this.iter) {
          return;
        }

        let next;

        try {
          next = this.iter.next();
        } catch (error) {
          util.print_stack(error instanceof Error ? error : undefined);
          this.stop();
          reject(error);
          return;
        }

        if (next.done) {
          this.stop();
          accept(this);
        }
      });
    });
  }

  stop() {
    if (this.timerid !== undefined) {
      window.clearInterval(this.timerid);
      this.timerid = undefined;
    }

    this.iter = undefined;
    this.dead = true;
    this.started = false;

    if (this.manager?.has(this)) {
      this.manager.removeTask(this);
    }
  }

  range(a: number, b: number, cb: (i: number) => void) {
    this.iter = (function*() {
      for (let i = a; i < b; i++) {
        cb(i);
        yield;
      }
    })()[Symbol.iterator]();

    return this;
  }
}

export class TaskManager {
  tasks: Task[]
  task_idmap: {[id: number]: Task}
  task_namemap: {[name: string]: Task}
  idgen: number

  constructor() {
    this.tasks = [];
    this.task_idmap = {};
    this.task_namemap = {};

    this.idgen = 0;
  }

  newTask(name: string, interval: number | undefined = undefined) {
    let task = new Task(name, interval);

    task.id = this.idgen++;
    task.manager = this;

    this.task_idmap[task.id] = task;
    this.task_namemap[task.name] = task;
    this.tasks.push(task);

    return task;
  }

  has(task_or_name: Task | string) {
    if (typeof task_or_name === 'string') {
      return task_or_name in this.task_namemap;
    } else {
      return task_or_name.id in this.task_idmap;
    }
  }

  [Symbol.iterator]() {
    let this2 = this;
    return (function*() {
      for (let task of this2.tasks) {
        yield task;
      }
    })
  }

  removeTask(task: Task) {
    if (task.id === -1) {
      console.error("already deleted task!", task);
      return;
    }

    delete this.task_idmap[task.id];

    if (this.task_namemap[task.name] === task) {
      delete this.task_namemap[task.name];
    }

    this.tasks.remove(task);

    task.id = -1;

    return this;
  }

  range(name: string, a: number, b: number, cb: (i: number) => void, interval: number | undefined = undefined) {
    return this.newTask(name, interval).range(a, b, cb);
  }

  stopNamed(name: string) {
    for (let task of new Set(this.tasks)) {
      if (task.name === name) {
        task.stop();
      }
    }
  }

  stopAll() {
    for (let task of new Set(this.tasks)) {
      task.stop();
    }

    return this;
  }
}

export const taskManager = new TaskManager();
