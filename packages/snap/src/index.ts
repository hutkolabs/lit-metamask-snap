import { handleKeyringRequest } from '@metamask/keyring-api';
import type {
  OnKeyringRequestHandler,
  OnRpcRequestHandler,
} from '@metamask/snaps-types';

import { ERC4337Keyring } from './keyring';
import { getState } from './management';
// import { logRequest } from './utils';

let keyring: ERC4337Keyring;

// Logs and pass the control to next handler
const loggerHandler: OnRpcRequestHandler = async ({ origin, request }) => {
  // await snap.request({
  //   method: 'snap_manageState',
  //   params: { operation: 'clear' },
  // });
  // console.log(
  //   await snap.request({
  //     method: 'snap_manageState',
  //     params: { operation: 'get' },
  //   }),
  // );

  const { id } = request;
  console.log(
    `[Snap] request (id=${id?.toString() ?? 'null'}, origin=${origin}):`,
    request,
  );
  // throw new MethodNotSupportedError(request.method);
};

// const customHandler: OnRpcRequestHandler = async ({
//   request,
// }): Promise<any> => {
//   switch (request.method) {
//     // internal methods
//     case SigningMethods.SendTransaction: {
//       return snap.request({
//         method: 'snap_dialog',
//         params: {
//           type: 'alert',
//           content: panel([
//             heading('Something happened in the system'),
//             text('The thing that happened is...'),
//           ]),
//         },
//       });
//     }

//     default: {
//       throw new MethodNotSupportedError(request.method);
//     }
//   }
// };

export const onRpcRequest: OnRpcRequestHandler = async ({
  origin,
  request,
}) => {
  await loggerHandler({ origin, request });

  if (!keyring) {
    const keyringState = await getState();
    // eslint-disable-next-line require-atomic-updates
    keyring = new ERC4337Keyring(keyringState);
  }
  return await handleKeyringRequest(keyring, request);
};

// export const onRpcRequest: OnRpcRequestHandler = buildHandlersChain(
//   loggerHandler,
//   keyringHandler,
// );

export const onKeyringRequest: OnKeyringRequestHandler = async ({
  origin,
  request,
}) => {
  await loggerHandler({ origin, request });

  if (!keyring) {
    const keyringState = await getState();
    // eslint-disable-next-line require-atomic-updates
    keyring = new ERC4337Keyring(keyringState);
  }
  return await handleKeyringRequest(keyring, request);
};
