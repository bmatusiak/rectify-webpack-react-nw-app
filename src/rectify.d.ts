//the plugin contract. javascript plugins get this from the editor, typescript
//plugins pull the types in with `type X = import('../../rectify').X`.

export interface App {
    //set by the entry, src/index.js or src/server.js. do not sniff globals:
    //nw's node context has a window with a document on it
    isServer?: boolean;

    //---- server side only, handed in by main.js -------------------------
    express?: any;
    //mount routes here, not on expressApp. this router is swapped out on
    //every server rebuild, which is what makes reloading routes possible
    router?: any;
    httpServer?: any;
    io?: any;
    appPackage?: AppPackage;

    //controllers for the real window and tray, present only under nw.js.
    //src/app/window and src/app/tray wrap these as services
    window?: any;
    tray?: any;

    //rectify's own event bus. server halves clean up on 'destroy'
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

//---- storage ------------------------------------------------------------

//what a store hands back: the defaults you asked for, plus save()
export type TypeStore<T> = T & { save(): void };

//`config` and `session` are both this: name a store, describe its shape with
//the defaults, and get it back typed
export type TypeStoreFactory = <T extends object>(name: string, defaults: T) => TypeStore<T>;

//---- theme --------------------------------------------------------------

export interface TrayItem { remove(): void }

export interface Window {
    readonly url: string;
    readonly isOpen: boolean;
    open(): void;
    show(): void;
    hide(): void;
    openInBrowser(): void;
    quit(reason?: string): void;
}

export interface Tray {
    //options are nw.MenuItem's: label, click, type, checked, enabled, ...
    add(options: Record<string, any>): TrayItem;
    labels(): string[];
}

export interface Theme {
    bs: any;//the kit itself
    $: any;//the kit's dom helper, jquery here
    themeSwitcher(): void;
    navbar: (props: any) => any;
    dialog: (props: any) => any;
}

//---- the service graph --------------------------------------------------

//every service a plugin can consume, across all three graphs. add yours here
//and every consumer, typescript or not, gets it named in one place.
export interface Services {
    app: App;

    //main only — the process around the app
    http: {
        express: any;
        app: any;
        server: any;
        readonly url: string | null;
        readonly router: any;
        swapRouter(): any;
        listen(): Promise<string>;
    };
    lifecycle: {
        readonly isShuttingDown: boolean;
        shutdown(reason: string): void;
        publish(url: string): void;
    };
    build: { ready(): Promise<void> };

    react: { root: any } | undefined;
    session: TypeStoreFactory;
    config: TypeStoreFactory;
    io: any;
    appPackage: AppPackage;
    theme: Theme | undefined;
    window: Window | undefined;
    tray: Tray | undefined;
}

//what a plugin's setup receives, given what it consumes:
//    async function plugin(imports: Imports<'app' | 'config'>, ...)
export type Imports<K extends keyof Services> = Pick<Services, K>;

export type Register = (err: Error | null, provided: Record<string, unknown>) => Promise<void> | void;
