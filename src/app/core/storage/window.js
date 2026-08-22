/**

var typeStore = app.services.settings('test', {
    testing: 'ok-default'
})

console.log(typeStore.testing);//'ok-default', and assigning to it saves

 */

//NAMED settings, NOT config, and the name is the whole of the reason. Every
//plugin already receives a `config` as its third setup argument -- its slice of
//src/config.js -- so a service by that name puts two different things called
//config in one function, and the one somebody reaches for is whichever they
//happened to think of. That is a bug nobody reports, because both exist.
//
//TWO STORES FROM ONE FACTORY, which is the line between bundling and dogma:
//they differ only in which browser storage they sit on, and neither can change
//without the other. Splitting them would be two plugins with one body.
//
//a store is described by its defaults. every key you pass becomes a property
//that reads through to storage and writes back on assignment, so there is no
//get/set to remember and nothing to serialise by hand.

plugin.consumes = [];
plugin.provides = ['session', 'settings'];
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
                //save is this object's own writer, so a default of that name
                //cannot be defined without shadowing it. Skipping it in silence
                //is how a form field called save ended up handing react a
                //function as `checked` -- say so instead.
                if (i === 'save') {
                    console.warn('storage: the ' + typeStore_name +
                        ' store has a field named save, which is its own method. Ignored.');
                    continue;
                }
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
        settings: typeStorage(localStorage),
    });
}
module.exports = plugin;
