import { ethers } from "ethers"

const target = '0x81b4e8b4'

const sigs = [
    // Different function names
    'send(uint256,address,uint256)',
    'transfer(uint256,address,uint256)',
    'crossChain(uint256,address,uint256)',
    'crossTransfer(uint256,address,uint256)',
    'bridgeToken(uint256,address,uint256)',
    'bridgeOut(uint256,address,uint256)',
    'lock(uint256,address,uint256)',
    'lockAndSend(uint256,address,uint256)',
    'deposit(uint256,address,uint256)',
    'sendToken(uint256,address,uint256)',
    'transferOut(uint256,address,uint256)',
    'transferCross(uint256,address,uint256)',
    'relay(uint256,address,uint256)',
    'dispatch(uint256,address,uint256)',
    'withdraw(uint256,address,uint256)',
    'sendCross(uint256,address,uint256)',
    'outbound(uint256,address,uint256)',
    'teleport(uint256,address,uint256)',
    // uint16 destChainId variants
    'send(uint16,address,uint256)',
    'transfer(uint16,address,uint256)',
    'bridgeToken(uint16,address,uint256)',
    'deposit(uint16,address,uint256)',
    'sendToken(uint16,address,uint256)',
    'lock(uint16,address,uint256)',
]

sigs.forEach(sig => {
    const selector = ethers.id(sig).slice(0, 10)
    const match = selector === target ? '✅ MATCH' : ''
    if (match) console.log(selector, '←', sig, match)
})

console.log('done')