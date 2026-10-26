// command-catalog.js
// The commands the reference lists, as data, for anything else that offers
// them (the controller menu and mapping view).
//
// index.html holds the entries, grouped into sections; this only reads them,
// so the reference and everything built on the catalog list the same
// commands in the same groups.

// list: the reference's list element.
// Returns [{ title, commands: [{ call, about }] }], in page order.
export function readCommandCatalog(list) {
    return [...list.querySelectorAll('.api-section')].map((section) => ({
        title: section.querySelector('h2').textContent.trim(),
        commands: [...section.querySelectorAll('li')].map((row) => ({
            call:  row.querySelector('code').textContent.trim(),
            about: row.querySelector('.api-about').textContent.trim(),
        })),
    }));
}
