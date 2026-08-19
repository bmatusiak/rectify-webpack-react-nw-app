/**

var typeStore = app.services.config('test', {
    testing: 'ok-default'
})

console.log(typeStore.testing);//'ok-default', and assigning to it saves

 */

//---------------------------------------------------------------------------
//this plugin is in typescript to show that it works, and nothing more. you are
//not restricted to it: .js and .ts build the same way and sit side by side in
//the same plugin list — every other plugin here is plain javascript. write in
//whichever you prefer, per plugin, and rename this one to .js if you would
//rather not have any typescript in the tree at all.
//
//if you do write typescript, two things are load bearing. keep the file
//commonjs: `module.exports` at the bottom, and types pulled in with import()
//rather than an `import type` statement. any import/export statement, even a
//type-only one, makes babel mark the output an es module and webpack then
//refuses the module.exports. the import() form below is erased outright.
//
//and remember the types are only stripped, never checked, during a build.
//`npm run typecheck` is what checks them.
//---------------------------------------------------------------------------
type Register = import('../../rectify').Register;
type TypeStore<T> = import('../../rectify').TypeStore<T>;
type TypeStoreFactory = import('../../rectify').TypeStoreFactory;

async function plugin(_imports: unknown, register: Register) {
    function typeStorage(storageObject: Storage): TypeStoreFactory {

        const getStored = (name: string): Record<string, unknown> => {
            const r = JSON.parse(storageObject.getItem(name) as string);
            if (r) return r;
            setStored(name, {});
            return getStored(name);
        };
        const setStored = (name: string, typeStoreObj: Record<string, unknown>) =>
            storageObject.setItem(name, JSON.stringify(typeStoreObj));

        return function typeStore<T extends object>(typeStore_name: string, typeStore_defaults: T) {
            const $typeStore_mem = getStored(typeStore_name);
            const $typeStore_obj = {
                save: function () {
                    setStored(typeStore_name, $typeStore_mem);
                }
            } as TypeStore<T>;
            const $bag = $typeStore_obj as Record<string, unknown>;

            for (const i in typeStore_defaults) {
                if (i === 'save') continue;
                ((typeStore_property: string, default_value: unknown) => {
                    Object.defineProperty($typeStore_obj, typeStore_property, {
                        get() {
                            return $typeStore_mem[typeStore_property];
                        },
                        set(newValue: unknown) {
                            $typeStore_mem[typeStore_property] = newValue;
                            $typeStore_obj.save();
                        },
                        enumerable: true,
                        configurable: true,
                    });
                    if (typeof $bag[typeStore_property] === 'undefined') {
                        $bag[typeStore_property] = default_value;
                        $typeStore_obj.save();
                    }
                })(i, typeStore_defaults[i]);
            }

            return $typeStore_obj;
        };
    }

    await register(null, {
        session: typeStorage(sessionStorage),
        config: typeStorage(localStorage),
    });
}

plugin.consumes = [] as string[];
plugin.provides = ['session', 'config'];

//`export =` would need babel's cjs transform, which preset-env leaves off so
//webpack can handle the modules itself. plain commonjs, same as the rest.
module.exports = plugin;
