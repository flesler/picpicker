### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

#### [v2.3.1](https://github.com/flesler/picpicker/compare/v2.3.0...v2.3.1)

- Use the srcset library to better parse srcset attributes [`972d67c`](https://github.com/flesler/picpicker/commit/972d67cb13224a592fd5ef3824192c750072a976)

#### [v2.3.0](https://github.com/flesler/picpicker/compare/v2.2.0...v2.3.0)

- General QoL improvements, reduce DOM creation code and add some DOM helpers [`fbfe0e8`](https://github.com/flesler/picpicker/commit/fbfe0e8daaaa197950942a15e9529498ebb82483)
- Remove much of the URL filtering logic, since all URLs are known to be images by context [`341aed8`](https://github.com/flesler/picpicker/commit/341aed8543998ac8c983def4c3684b3666d39b64)
- Extract image from ::before and ::after image sources [`654cf70`](https://github.com/flesler/picpicker/commit/654cf70c6b3dac5d78e612e0146a7824345b3dbb)
- Transition from ESLint from recommended-type-checked to strict-type-checked [`ed3e25c`](https://github.com/flesler/picpicker/commit/ed3e25cb1e05cbec90fa4d90866a358e687b6b6f)
- Fire an alert when no images could be extracted from a page [`8437c69`](https://github.com/flesler/picpicker/commit/8437c69d27d521ac7ad6a194809e6037c1f86cc8)
- Improve background extraction, now works in Getty images [`018a91d`](https://github.com/flesler/picpicker/commit/018a91db01b3f108b1b1080e39a5f1577f61b913)
- Handle URLs without protocol, prepend it [`066c257`](https://github.com/flesler/picpicker/commit/066c257a64994e7646e2934d3469e7b921b10fad)
- Handle a few domains known to block via CORS/CORP, don't even try to display those and show a warning [`67465f6`](https://github.com/flesler/picpicker/commit/67465f6e12975a54df55e9880dec4872b3c7831b)

#### [v2.2.0](https://github.com/flesler/picpicker/compare/v2.1.0...v2.2.0)

- Add 'Save As' checkbox functionality and update download settings [`2896229`](https://github.com/flesler/picpicker/commit/28962296d101932e25f8442b22af5b95baae747d)
- Un-implement the text search functionality [`7ad87de`](https://github.com/flesler/picpicker/commit/7ad87decf82bdab909dafa7ab3a4c25ecc65bfe0)

#### [v2.1.0](https://github.com/flesler/picpicker/compare/v2.0.1...v2.1.0)

- Add ESLint plugin to prevent unsanitized innerHTML and prevent releases with linting errors [`07cc167`](https://github.com/flesler/picpicker/commit/07cc167cde6ddc52fb3a23e50fa121f92347476c)
- Add the @typescript-eslint/recommended-type-checked ESLint config [`964d687`](https://github.com/flesler/picpicker/commit/964d68786052956ead1cc73eeb4ff664e5864548)
- Double clicking a grid item auto-downloads it [`c0618ce`](https://github.com/flesler/picpicker/commit/c0618ce2e6ae9933611ce135dc450e03fdfddfd5)

#### [v2.0.1](https://github.com/flesler/picpicker/compare/v2.0.0...v2.0.1)

- Remove the total image count in the results page title [`ca25639`](https://github.com/flesler/picpicker/commit/ca25639b0d3b7ab3774d65aada1b90a86acfd441)
- Firefox doesn't actually need the browser-polyfill. Don't include it [`0073bb5`](https://github.com/flesler/picpicker/commit/0073bb514389adf63e78a2826ea8e51a5eee39fc)
- Disable filter dropdown options that wouldn't match any items [`55d7efa`](https://github.com/flesler/picpicker/commit/55d7efa613244c9ec50a4a5153ee559e15245d78)

### [v2.0.0](https://github.com/flesler/picpicker/compare/v1.2.2...v2.0.0)

- Include the data_collection_permissions in Mozilla's manifests [`c40c3d7`](https://github.com/flesler/picpicker/commit/c40c3d7f37dfa1146e66207bcd99b5b8efc307de)
- Remove the popup, clicking the extension auto-opens the results [`b385dec`](https://github.com/flesler/picpicker/commit/b385decf2381a4738176b436be66f7fe4c26f5c8)
- Update the logo to a new one [`7317814`](https://github.com/flesler/picpicker/commit/7317814f3f1120165dd526998fdad84b4df0ffb9)
- Improve the results layout to take less space from the grid [`4981fb5`](https://github.com/flesler/picpicker/commit/4981fb566f20f52f40112010c12a0b80cf5a6b84)

#### [v1.2.2](https://github.com/flesler/picpicker/compare/v1.2.1...v1.2.2)

- Use some DOM method wrappers, reduce .js size in almost 10% [`54da355`](https://github.com/flesler/picpicker/commit/54da355f0c29ce939ad6b286b5eb116ab1eab92d)
- Setup Mozilla's addon-linter [`55cd612`](https://github.com/flesler/picpicker/commit/55cd612a546a97775a0d36ae8d3a4182884051e6)
- Replace all usage of innerHTML for DOM manipulation for safer code [`90c77f9`](https://github.com/flesler/picpicker/commit/90c77f9f20de4d4bad47a0e096a8e3103128b9e5)

#### [v1.2.1](https://github.com/flesler/picpicker/compare/v1.2.0...v1.2.1)

- Various improvements related to the build process [`d6fda83`](https://github.com/flesler/picpicker/commit/d6fda83b8e79674a63343153a3baf502bb92450e)
- Extract the browser-polyfill.js as a vendor script. Loaded once instead of bundled on each of the 4 .js's [`38f2dfb`](https://github.com/flesler/picpicker/commit/38f2dfbf95f417cdf4bb63b9199ae7515feed97a)

#### [v1.2.0](https://github.com/flesler/picpicker/compare/v1.1.0...v1.2.0)

- Update the md files after dropping the ZIP download aspect [`58b7608`](https://github.com/flesler/picpicker/commit/58b76089b66f8b77b81293f425ff7c8ca5cf4c78)
- Add esbuild-plugin-copy for asset management in build process [`de4ebbf`](https://github.com/flesler/picpicker/commit/de4ebbfda273da4e77a8a69ec7cbdc906dae3d66)
- Greatly improve and optimize the npm scripts and tsup config [`daa30d5`](https://github.com/flesler/picpicker/commit/daa30d5e84b57eff5e303c7b4a0a36fbd48d3af5)
- Implement arrow keys navigation and selection [`0572fe6`](https://github.com/flesler/picpicker/commit/0572fe6e43a5d2cc08526f8b66e55010104c925d)
- Add informational sign explaining the keyboard and mouse shortcuts available [`4515ca0`](https://github.com/flesler/picpicker/commit/4515ca056a3689b72d7c4ef76f8bfd9f71f3edc6)
- Add support for pressing Enter to download the current image [`0343880`](https://github.com/flesler/picpicker/commit/0343880bbd1fda2d825b30805296aa8d67329755)
- Add support for Home/End keys and unify mouse and keyboard selection index [`347f9a0`](https://github.com/flesler/picpicker/commit/347f9a0e14f39af1b26d34da75cc16816661bf0c)
- Downloaded images are marked with a green checkbox, cannot be double-downloaded [`20db879`](https://github.com/flesler/picpicker/commit/20db879cc8a6abb9ff349caf85481aacec02fde5)
- Pressing Enter on a selected image downloads all the selected ones [`9dea87d`](https://github.com/flesler/picpicker/commit/9dea87d822ecb299c1008751193006407e889826)
- The addon remembers the last selected grid size and restores (Small/Medium/Large) [`ca72c48`](https://github.com/flesler/picpicker/commit/ca72c48c5be6b935be3b686ef1cfb618f2907ea2)
- Show counts on every filter dropdown option, on how many images match that filter [`fe6d58d`](https://github.com/flesler/picpicker/commit/fe6d58d0cf01e8367f40f147b8e652e963d718a8)
- Add an all-time downloads counter to the top right [`3b18685`](https://github.com/flesler/picpicker/commit/3b18685d04d2c3ce4444f08f0beab8eb14e5464e)

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
