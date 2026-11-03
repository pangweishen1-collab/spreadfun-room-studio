# Custom avatar fonts

Eight Latin font families are served locally. Six use genuine variable-font weight axes: Inter 100–900, Montserrat 100–900, Oswald 200–700, Playfair Display 400–900, Cinzel 400–900 and Orbitron 400–900. Bebas Neue and Pacifico have only their original 400 face; the browser may synthesize bold when requested. Cap requested variable weights to the family range, especially Oswald at 700.

Fonts are obtained from the official Google Fonts CSS API only during development. The application has no external font dependency. Each original SIL Open Font License 1.1 is distributed alongside its font. The `FT ` prefix is only a CSS family alias; original binaries and internal names remain unchanged. `manifest.json` records exact source URLs, hashes, weight ranges and upstream metadata.

Wait for `document.fonts.load` with the selected weight before measuring or drawing text, then rasterize the text into the SVGA image. Receiving players do not need these fonts installed. These are Latin subsets; retain system fallbacks for other scripts.
