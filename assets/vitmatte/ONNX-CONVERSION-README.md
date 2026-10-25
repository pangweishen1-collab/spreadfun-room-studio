---
base_model: hustvl/vitmatte-small-composition-1k
library_name: transformers.js
---

https://huggingface.co/hustvl/vitmatte-small-composition-1k with ONNX weights to be compatible with Transformers.js.

## Usage (Transformers.js)

If you haven't already, you can install the [Transformers.js](https://huggingface.co/docs/transformers.js) JavaScript library from [NPM](https://www.npmjs.com/package/@huggingface/transformers) using:
```bash
npm i @huggingface/transformers
```

**Example:** Perform image matting with a `VitMatteForImageMatting` model.
```javascript
import { AutoProcessor, VitMatteForImageMatting, RawImage } from '@huggingface/transformers';

// Load processor and model
const processor = await AutoProcessor.from_pretrained('Xenova/vitmatte-small-composition-1k');
const model = await VitMatteForImageMatting.from_pretrained('Xenova/vitmatte-small-composition-1k');

// Load image and trimap
const image = await RawImage.fromURL('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/vitmatte_image.png');
const trimap = await RawImage.fromURL('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/vitmatte_trimap.png');

// Prepare image + trimap for the model
const inputs = await processor(image, trimap);

// Predict alpha matte
const { alphas } = await model(inputs);
// Tensor {
//   dims: [ 1, 1, 640, 960 ],
//   type: 'float32',
//   size: 614400,
//   data: Float32Array(614400) [ 0.9894027709960938, 0.9970508813858032, ... ]
// }
```

You can visualize the alpha matte as follows:
```javascript
import { Tensor, cat } from '@huggingface/transformers';

// Visualize predicted alpha matte
const imageTensor = new Tensor(
  'uint8',
  new Uint8Array(image.data),
  [image.height, image.width, image.channels]
).transpose(2, 0, 1);

// Convert float (0-1) alpha matte to uint8 (0-255)
const alphaChannel = alphas
  .squeeze(0)
  .mul_(255)
  .clamp_(0, 255)
  .round_()
  .to('uint8');

// Concatenate original image with predicted alpha
const imageData = cat([imageTensor, alphaChannel], 0);

// Save output image
const outputImage = RawImage.fromTensor(imageData);
outputImage.save('output.png');
```

Example inputs:
| Image| Trimap |
|--------|--------|
| ![vitmatte_image](https://cdn-uploads.huggingface.co/production/uploads/61b253b7ac5ecaae3d1efe0c/gIwr_finBzqCrzD8Y0Ghm.png) | ![vitmatte_trimap](https://cdn-uploads.huggingface.co/production/uploads/61b253b7ac5ecaae3d1efe0c/ozO5KfIuA3kVZChMelrAZ.png) | 

Example outputs:
| Quantized | Unquantized |
|--------|--------|
| ![output_quantized](https://cdn-uploads.huggingface.co/production/uploads/61b253b7ac5ecaae3d1efe0c/8wHotR5jDkyS71HR6MHJF.png) | ![output_unquantized](https://cdn-uploads.huggingface.co/production/uploads/61b253b7ac5ecaae3d1efe0c/rHN_eI3Bdq4_VF-EgmLZ3.png) | 

---


Note: Having a separate repo for ONNX weights is intended to be a temporary solution until WebML gains more traction. If you would like to make your models web-ready, we recommend converting to ONNX using [🤗 Optimum](https://huggingface.co/docs/optimum/index) and structuring your repo like this one (with ONNX weights located in a subfolder named `onnx`).