import { downloadToTemp } from './src/utils/media.js';
downloadToTemp('https://photo-stal-24.zdn.vn/no/jpg/a7652ec625c4e39abad5/2aOboQpdd0I1X4pXncTvunHxSq7ojzOSZvMat160.jpg', 'test.jpg')
  .then(res => console.log('DL OK:', res))
  .catch(err => console.log('DL ERR:', err.message));
