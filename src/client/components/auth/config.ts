export const extensionConfig = {
  disallowed: [],
  supported: [
    {
      id: 'polkadot-js',
      title: 'polkadotJS',
      image: '/polkadot-js-icon.svg',
      urls: {
        main: 'https://polkadot.js.org/extension/',
      },
    },
    {
      id: 'talisman',
      title: 'talisman',
      image: '/talisman-icon.svg',
      urls: {
        main: 'https://www.talisman.xyz/wallet',
      },
    },
    {
      id: 'subwallet',
      title: 'Subwallet',
      image: '/subwallet-js-icon.svg',
      urls: {
        main: 'https://www.subwallet.app/',
      },
    },
    {
      id: 'enkrypt',
      title: 'Enkrypt',
      image: '/enkrypt-icon.svg',
      urls: {
        main: 'https://www.enkrypt.com/',
        reference: 'https://blog.enkrypt.com/use-enkrypt-with-polkadot/',
      },
    },
  ],
}

export const walletConnectConfig = {
  // @todo add to vars
  projectId: 'a7af023707d162a2fbe91a2a66ad9e2e',
  relayUrl: 'wss://relay.walletconnect.com',
  chainIds: [
    'polkadot:e143f23803ac50e8f6f8e62695d1ce9e',
    'polkadot:91b171bb158e2d3848fa23a9f1c25182',
  ],
  optionalChainIds: [
    'polkadot:67f9723393ef76214df0118c34bbbd3d',
    'polkadot:7c34d42fc815d392057c78b49f2755c7',
  ],
  metadata: {
    name: process.env.APP_NAME,
    description: process.env.APP_NAME,
    url: process.env.APP_HOST,
    icons: ['https://i.ibb.co/YDzD5S8/apple-touch-icon-1.png'],
  },
  // @todo be able to pass this and any other configuration for the modal
  walletConnectConfig: {
    explorerRecommendedWalletIds: [
      //  nova wallet
      '43fd1a0aeb90df53ade012cca36692a46d265f0b99b7561e645af42d752edb92',
      // subwallet
      '9ce87712b99b3eb57396cc8621db8900ac983c712236f48fb70ad28760be3f6a',
    ],
    // enableExplorer: false,
  },
  onSessionDelete: () => {
    console.log('session was deleted')
  },
}