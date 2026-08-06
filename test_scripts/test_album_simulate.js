import { zaloAlbumStore } from './build/store.js';

const bufMock = [];

function onFlush(buf) {
  console.log("FLUSH TRIGGERED:", buf.items.length);
  bufMock.push(buf);
}

zaloAlbumStore.add(
  '123:123',
  'http://example.com/1.jpg',
  ['msg1'],
  undefined,
  { senderName: 'Đăng', topicId: 11, tgBase: undefined, zaloQuote: undefined },
  onFlush,
  0,
  []
);

setTimeout(() => {
  zaloAlbumStore.add(
    '123:123',
    'http://example.com/2.jpg',
    ['msg2'],
    undefined,
    { senderName: 'Đăng', topicId: 11, tgBase: undefined, zaloQuote: undefined },
    onFlush,
    1,
    []
  );
}, 200);

setTimeout(() => {
  console.log("Done");
}, 2000);
