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

    //the window and tray controller, present only under nw.js. src/core/nw
    //wraps it as the `nw` service
    nw?: any;

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

export interface Nw {
    readonly url: string;
    readonly hasWindow: boolean;
    open(): void;
    hide(): void;
    openInBrowser(): void;
    quit(reason?: string): void;
    tray: {
        //options are nw.MenuItem's: label, click, type, checked, enabled, ...
        add(options: Record<string, any>): TrayItem;
        labels(): string[];
    };
}

export interface Theme {
    bs: any;//the kit itself
    $: any;//the kit's dom helper, jquery here
    themeSwitcher(): void;
    navbar: (props: any) => any;
    dialog: (props: any) => any;
}

//---- the service graph --------------------------------------------------

//every service a plugin can consume. add yours here and every consumer,
//typescript or not, gets it named in one place.
export interface Services {
    app: App;
    react: { root: any } | undefined;
    session: TypeStoreFactory;
    config: TypeStoreFactory;
    io: any;
    appPackage: AppPackage;
    theme: Theme | undefined;
    nw: Nw | undefined;
}

//what a plugin's setup receives, given what it consumes:
//    async function plugin(imports: Imports<'app' | 'config'>, ...)
export type Imports<K extends keyof Services> = Pick<Services, K>;

export type Register = (err: Error | null, provided: Record<string, unknown>) => Promise<void> | void;
