/**

var typeStore = app.services.config('test', {
    testing: 'ok-default'
})

console.log(typeStore.testing);//'ok-default', and assigning to it saves

 */

//two stores over the browser's own storage, differing only in which one they
//sit on: `config` survives the window closing, `session` does not.
//
//a store is described by its defaults. every key you pass becomes a property
//that reads through to storage and writes back on assignment, so there is no
//get/set to remember and nothing to serialise by hand.

plugin.consumes = [];
plugin.provides = ['session', 'config'];
async function plugin(_imports, register) {

    function typeStorage(storageObject) {

        var getStored = function (name) {
            var r = JSON.parse(storageObject.getItem(name));
            if (r) return r;
            setStored(name, {});
            return getStored(name);
        };

        var setStored = function (name, typeStoreObj) {
            return storageObject.setItem(name, JSON.stringify(typeStoreObj));
        };

        return function typeStore(typeStore_name, typeStore_defaults) {
            var $typeStore_mem = getStored(typeStore_name);
            var $typeStore_obj = {
                save: function () {
                    setStored(typeStore_name, $typeStore_mem);
                }
            };

            for (var i in typeStore_defaults) {
                if (i === 'save') continue;
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
                    if (typeof $typeStore_obj[typeStore_property] === 'undefined') {
                        $typeStore_obj[typeStore_property] = default_value;
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
module.exports = plugin;
