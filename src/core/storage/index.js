/**

var typeStore = app.typeStore('test',{
    testing : 'ok-default'
})

console.log(typeStore.testing);

 */

plugin.consumes = ['app'];
plugin.provides = ['session', 'config'];
async function plugin(imports, register) {
    var empty = () => { return {} };
    if (!imports.app.isBrowser) return register(null, { config: empty, session: empty })

    function typeStorage(storeageObject) {

        const getStored = (name) => {
            var r = JSON.parse(storeageObject.getItem(name));
            if (r) return r;
            setStored(name, {});
            return getStored(name);
        };
        const setStored = (name, typeStoreObj) =>
            storeageObject.setItem(name, JSON.stringify(typeStoreObj));

        return function typeStore(typeStore_name, typeStore_defaults) {
            var $typeStore_mem = getStored(typeStore_name);
            var $typeStore_obj = {
                save: function () {
                    setStored(typeStore_name, $typeStore_mem)
                }
            };

            for (var i in typeStore_defaults) {
                if (i == 'save') continue;
                ((typeStore_property, default_value) => {
                    Object.defineProperty($typeStore_obj, typeStore_property, {
                        get() {
                            return $typeStore_mem[typeStore_property];
                        },
                        set(newValue) {
                            $typeStore_mem[typeStore_property] = newValue;
                            $typeStore_obj.save();
                        },
                        enumerable: true,
                        configurable: true,
                    });
                    if (typeof $typeStore_obj[typeStore_property] == 'undefined') {
                        $typeStore_obj[typeStore_property] = default_value;
                        $typeStore_obj.save();
                    }
                })(i, typeStore_defaults[i]);
            }

            return $typeStore_obj;
        }
    }

    await register(null, {
        session: typeStorage(sessionStorage),
        config: typeStorage(localStorage),
    });


}
module.exports = plugin;