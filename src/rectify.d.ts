//the shape a rectify plugin has here. javascript plugins get this for free
//from the editor, typescript ones import it.

export interface App {
    //set by the entry, src/index.js or src/server.js. do not sniff globals:
    //nw's node context has a window with a document on it
    isServer?: boolean;

    //present on the server side, handed in by main.js
    express?: unknown;
    expressApp?: any;
    httpServer?: any;
    io?: any;
    appPackage?: AppPackage;

    on(name: string, cb: (...args: any[]) => void): void;
    once(name: string, cb: (...args: any[]) => void): void;
    emit(name: string, ...args: any[]): void;
    readonly services: Record<string, unknown>;
}

export interface AppPackage {
    title: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    license?: string;
}

export type Register = (err: Error | null, provided: Record<string, unknown>) => Promise<void> | void;

export interface Plugin {
    (imports: any, register: Register): Promise<void> | void;
    consumes: string[];
    provides: string[];
}
