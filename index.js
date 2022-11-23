const FactoryABI = require("./ABI/FactoryABI");
const RouterABI = require("./ABI/RouterABI");
const erc20ABI = require("./ABI/erc20ABI");
const { ethers } = require("ethers");
require("dotenv").config();

const addresses = {
  BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
  router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  token: "0xf9eC2B8FfB7A9aCA3b142939a63Fd5572CD3a308",
};

const wallet = {
  address: process.env.ADR,
  key: process.env.PVK,
};

// new RPC connection
const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
const account = new ethers.Wallet(wallet.key, provider);

// contract details
const factory = new ethers.Contract(addresses.factory, FactoryABI, account);
const router = new ethers.Contract(addresses.router, RouterABI, account);
const busd = new ethers.Contract(addresses.BUSD, erc20ABI, account);

factory.on("PairCreated", async (token0, token1, pairAddress) => {
  console.log(`
    New pair detected
    =================
    token0: ${token0}
    token1: ${token1}
    pairAddress: ${pairAddress}
  `);

  //The quote currency needs to be BUSD (we will pay with BUSD)
  let tokenIn, tokenOut;
  if (token0 === addresses.BUSD && token1 === addresses.token) {
    tokenIn = token0;
    tokenOut = token1;
  } else if (token1 == addresses.BUSD && token0 === addresses.token) {
    tokenIn = token1;
    tokenOut = token0;
  } else return;

  buyToken(tokenIn, tokenOut);
});

const buyToken = async (tokenIn, tokenOut, tries = 1) => {
  try {
    // limit to maximum 13 tries
    if (tries > 13) return false;
    console.log(`Try #${tries}...`);
    console.log("Buying Token...");

    const amountIn = await busd.balanceOf(wallet.address);
    const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
    //Our execution price will be a bit different, we need some flexbility
    const amountOutMin = amounts[1].sub(amounts[1].div(10));

    console.log(`
      Buying new token
      =================
      tokenIn: ${amountIn.toString()} ${tokenIn} (BUSD)
      tokenOut: ${amountOutMin.toString()} ${tokenOut}
    `);

    const tx = await router.swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      [tokenIn, tokenOut],
      addresses.recipient,
      Date.now() + 1000 * 60 * 10 //10 minutes
    );

    const receipt = await tx.wait();
    console.log("Transaction receipt");
    console.log(receipt);
  } catch (error) {
    // failed disconnect
    console.error(error);
    console.log("Buying Failed!");
    console.log("retrying...");

    // try again
    return await buyToken(tokenIn, tokenOut, ++tries);
  }

  return false;
};
