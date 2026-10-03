# Asset provenance

- Original golfer mesh, skeleton, facial morphs, hats and twelve animation clips: `tools/build_golfer.py`, released as CC0 for this project. Native source: `assets/source/golfer.blend`. Runtime export: `public/assets/golfer.glb`.
- Original procedural music, swish, splash, explosion and victory audio: `tools/audio_assets.py`, CC0.
- Footsteps and impact samples: [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), CC0. The pack license is bundled at `public/assets/audio/impacts-LICENSE.txt`.
- Pickup/menu sample: [Kenney UI Audio](https://kenney.nl/assets/ui-audio), CC0. License: `public/assets/audio/ui-LICENSE.txt`.

No artwork, character meshes, audio or animation files from Super Battle Golf are included. Its public gameplay was used as a design reference; this project's character and animation source is original.

To regenerate the audio, extract the two official Kenney downloads into `artifacts/tools/impacts` and `artifacts/tools/ui`, then run `python tools/audio_assets.py`. Only the selected runtime audio files are included in the website.
