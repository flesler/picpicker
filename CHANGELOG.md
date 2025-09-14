### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

#### [v1.1.0](https://github.com/flesler/picpicker/compare/v1.0.1...v1.1.0)

- Add max-width to results text for better layout [`db7da7b`](https://github.com/flesler/picpicker/commit/db7da7bdbd81b4e79493d8f4d2863d455cc7d55d)
- Update allowedFormats in DEFAULT_EXTRACTION_SETTINGS to include 'avif', 'apng', 'ico', and 'bmp' [`88d9519`](https://github.com/flesler/picpicker/commit/88d951998a3d405f61fcafd5d67ff5666417c7dd)
- Use the native browser download method to avoid CORS issues, preserve path's filename when possible [`9cb18be`](https://github.com/flesler/picpicker/commit/9cb18be1cf4c27a98e24494bee98123473de706f)
- Switch multi-file download to use individual browser downloads, remove all ZIP code the dependency [`7e4768c`](https://github.com/flesler/picpicker/commit/7e4768c508393054a8a45d750caba57527a83b96)

#### [v1.0.1](https://github.com/flesler/picpicker/compare/v1.0.0...v1.0.1)

- Clean the code, reduce repetition [`6228a2c`](https://github.com/flesler/picpicker/commit/6228a2c04234659c957965861667541abbbd4223)
- Truncate page title to span no more than one line [`115282c`](https://github.com/flesler/picpicker/commit/115282c8bee8b5475223aaecd65c725870338c18)
- Fix image order in DOM and data differ, messes up shift+click selection [`b4f6d21`](https://github.com/flesler/picpicker/commit/b4f6d2111e88b5e446a23e34b3bbb964ed9a3261)
- Remove the downloads permission, not needed [`2822a9d`](https://github.com/flesler/picpicker/commit/2822a9dbfed8f838ed3ebe25b7aaaf7fba557ae8)

#### v1.0.0

- First release of PicPicker [`de564fb`](https://github.com/flesler/picpicker/commit/de564fb6566f3ae7530c47681d108277e136f256)
