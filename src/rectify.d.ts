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
    expressApp?: any;
    httpServer?: any;
    io?: any;
    appPackage?: AppPackage;

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
}

//what a plugin's setup receives, given what it consumes:
//    async function plugin(imports: Imports<'app' | 'config'>, ...)
export type Imports<K extends keyof Services> = Pick<Services, K>;

export type Register = (err: Error | null, provided: Record<string, unknown>) => Promise<void> | void;

export interface Plugin {
    (imports: any, register: Register, config?: Record<string, any>): Promise<void> | void;
    consumes: string[];
    provides: string[];
}
