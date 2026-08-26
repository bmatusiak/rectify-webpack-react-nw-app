/**

var typeStore = app.services.preferences('test', {
    testing: 'ok-default'
})

console.log(typeStore.testing);//'ok-default', and assigning to it saves

 */

//WHAT LIVES HERE IS THE PERSON'S, AND IT IS DISPOSABLE. Both stores are the
//browser's -- `sessionStorage` and `localStorage` -- so what is in them belongs
//to whoever is sitting there, and it is gone when the browser profile is.
//Renaming the app in package.json is enough to do that: nw picks its profile
//directory from the name, so a rename is a new profile and an empty store. See
//../dataDir, which is where that is written down.
//
//WHICH IS WHY NOTHING AUTHORITATIVE GOES IN EITHER OF THEM. The app's own
//things -- what it did, what it was told, anything a person would be upset to
//lose -- belong to ../state, on disk, on the node side. This is the tab you had
//open and the swatch you picked.
//
//NAMED preferences, NOT settings AND NOT config. Not `config`, because every
//plugin already receives one as its third setup argument -- its slice of
//src/config.js -- and two different things called config in one function is a
//bug nobody reports, because both exist. And not `settings`, which was the name
//until ../state arrived: `settings` and `state` both read as APP configuration,
//and the one that silently evaporates when the app is renamed was the one
//called settings. Somebody would eventually put a credential in it.
//
//TWO STORES FROM ONE FACTORY, which is the line between bundling and dogma:
//they differ only in which browser storage they sit on, and neither can change
//without the other. Splitting them would be two plugins with one body.
//
//a store is described by its defaults. every key you pass becomes a property
//that reads through to storage and writes back on assignment, so there is no
//get/set to remember and nothing to serialise by hand.

plugin.consumes = [];
plugin.provides = ['session', 'preferences'];
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
        preferences: typeStorage(localStorage),
    });
}
module.exports = plugin;
