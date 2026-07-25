// ABI + hang so trang thai dung chung cho ca frontend, API route va agent script.
// Truoc day moi noi tu dinh nghia mot ban, dan toi viec them state DISPUTED o
// CP-1 ma page.jsx khong biet -> UI hien undefined. Gio chi sua o day.

export const ESCROW_ABI = [
  { inputs: [], name: 'seller', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'buyer', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'itemPrice', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'deposit', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getState', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getBalance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'createdAt', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'activeAt', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'requestedAt', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'requestInitiator', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'itemDescription', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'itemImageHash', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'returnEvidenceHash', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '_addressHash', type: 'string' }], name: 'joinAsBuyer', outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [], name: 'confirmDelivery', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'cancelAfter24h', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'claimAfterBuyerTimeout', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'requestCancel', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'withdrawCancelRequest', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'approveCancel', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'evidenceHash', type: 'string' }], name: 'requestReturn', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'withdrawReturnRequest', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'approveReturn', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'executeReturnAfterTimeout', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'ipfsHash', type: 'string' }], name: 'uploadItemImage', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'raiseDispute', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'releaseToSeller', type: 'bool' }], name: 'resolveDispute', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { name: 'CancelRequested', type: 'event', inputs: [{ name: 'by', type: 'address', indexed: true }] },
  { name: 'ReturnRequested', type: 'event', inputs: [{ name: 'by', type: 'address', indexed: true }, { name: 'evidenceHash', type: 'string', indexed: false }] },
  { name: 'DisputeRaised', type: 'event', inputs: [{ name: 'by', type: 'address', indexed: true }] },
];

export const FACTORY_ABI = [
  {
    inputs: [
      { name: '_itemPrice', type: 'uint256' },
      { name: '_description', type: 'string' },
    ],
    name: 'createEscrow',
    outputs: [{ type: 'address' }],
    stateMutability: 'payable',
    type: 'function',
  },
  { inputs: [], name: 'getTotalEscrows', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'uint256' }], name: 'allEscrows', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'agent', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  {
    name: 'EscrowCreated',
    type: 'event',
    inputs: [
      { name: 'escrowAddress', type: 'address', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'itemPrice', type: 'uint256', indexed: false },
      { name: 'description', type: 'string', indexed: false },
    ],
  },
];

export const STATE = {
  AWAITING_BUYER: 0,
  ACTIVE: 1,
  CANCEL_REQUESTED: 2,
  RETURN_REQUESTED: 3,
  COMPLETED: 4,
  CANCELLED: 5,
  SELLER_CLAIMED: 6,
  DISPUTED: 7,
};

export const STATE_LABELS = [
  'AWAITING BUYER',
  'ACTIVE',
  'CANCEL REQUESTED',
  'RETURN REQUESTED',
  'COMPLETED',
  'CANCELLED',
  'SELLER CLAIMED',
  'DISPUTED',
];

export const STATE_COLORS = [
  '#93641E',
  '#3E6B43',
  '#A23A34',
  '#93641E',
  '#2B6C93',
  '#7A776D',
  '#7A776D',
  '#A23A34',
];

export const DONE_STATES = [STATE.COMPLETED, STATE.CANCELLED, STATE.SELLER_CLAIMED];
