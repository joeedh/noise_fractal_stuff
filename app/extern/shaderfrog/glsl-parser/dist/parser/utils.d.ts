import type { Scope } from './parser';
export declare const renameBindings: (scope: Scope, preserve: Set<string>, suffix: string) => void;
export declare const renameTypes: (scope: Scope, preserve: Set<string>, suffix: string) => void;
export declare const renameFunctions: (scope: Scope, suffix: string, map: {
    [name: string]: string;
}) => void;
