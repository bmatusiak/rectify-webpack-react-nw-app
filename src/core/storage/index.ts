/**

var typeStore = app.services.config('test', {
    testing: 'ok-default'
})

console.log(typeStore.testing);//'ok-default', and assigning to it saves

 */

//types pulled in with import() rather than `import type`. an `import`
//statement, even a type-only one, makes babel mark the output as an es module
//and webpack then refuses the `module.exports` at the bottom. this form is
//erased outright, so the file stays commonjs like every other plugin.
type Imports = import('../../rectify').Imports<'app'>;
type Register = import('../../rectify').Register;
type TypeStore<T> = import('../../rectify').TypeStore<T>;
type TypeStoreFactory = import('../../rectify').TypeStoreFactory;

async function plugin(imports: Imports, register: Register) {
    const empty = (() => ({})) as unknown as TypeStoreFactory;
    if (imports.app.isServer) return register(null, { config: empty, session: empty });

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

plugin.consumes = ['app'];
plugin.provides = ['session', 'config'];

//`export =` would need babel's cjs transform, which preset-env leaves off so
//webpack can handle the modules itself. plain commonjs, same as the rest.
module.exports = plugin;
