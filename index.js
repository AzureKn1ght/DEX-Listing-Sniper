const FactoryABI = require("./ABI/FactoryABI");
const RouterABI = require("./ABI/RouterABI");
const erc20ABI = require("./ABI/erc20ABI");
const nodemailer = require("nodemailer");
const { ethers } = require("ethers");
require("dotenv").config();

const addresses = {
  BUSD: "0x55d398326f99059ff775485246999027b3197955", //Actually USDT
  factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
  router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  token: "0xc6C0C0f54a394931a5b224c8b53406633e35eeE7",
};

var report = [];
const wallet = {
  address: process.env.ADR,
  key: process.env.PVK,
};

// new RPC connection
const provider = new ethers.providers.WebSocketProvider(process.env.BSC_WSS);
const account = new ethers.Wallet(wallet.key, provider);
console.log("Bot Started!");

// contract details
const factory = new ethers.Contract(addresses.factory, FactoryABI, account);
const router = new ethers.Contract(addresses.router, RouterABI, account);
const busd = new ethers.Contract(addresses.BUSD, erc20ABI, account);

factory.on("PairCreated", async (token0, token1, pairAddress) => {
  console.log("listening...");
  let tokenIn, tokenOut;

  //The quote currency needs to be BUSD (we will pay with BUSD)
  if (token0 === addresses.BUSD && token1 === addresses.token) {
    tokenIn = token0;
    tokenOut = token1;
  } else if (token1 == addresses.BUSD && token0 === addresses.token) {
    tokenIn = token1;
    tokenOut = token0;
  } else return;

  const display = `
    New pair detected
    =================
    token0: ${token0}
    token1: ${token1}
    pairAddress: ${pairAddress}
  `;
  console.log(display);
  report.push(display);

  await buyToken(tokenIn, tokenOut);
  return sendReport(report);
});

const buyToken = async (tokenIn, tokenOut, tries = 1) => {
  try {
    // limit to maximum 13 tries
    if (tries > 13) return false;
    console.log(`Try #${tries}...`);
    console.log("Buying Token...");

    // get the current nounce to force override with new transaction
    const nonce = await provider.getTransactionCount(wallet.address);
    const overrideOptions = {
      nonce: nonce,
      gasLimit: 999999,
      gasPrice: ethers.utils.parseUnits((7 + tries).toString(), "gwei"),
    };

    const amountIn = await busd.balanceOf(wallet.address);
    const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
    // our execution price will be a bit different, we need some flexbility
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
      wallet.address,
      Date.now() + 1000 * 60 * 5, //5 minutes
      overrideOptions
    );

    const receipt = await tx.wait();
    console.log("Transaction receipt");
    console.log(receipt);

    report.push(receipt.toString());
    sendReport(report);
    return true;
  } catch (error) {
    // fail, retrying...
    console.error(error);
    console.log("Buying Failed!");
    console.log("retrying...");
    report.push(error.toString());

    // try again
    return await buyToken(tokenIn, tokenOut, ++tries);
  }
};

// Send Report Function
const sendReport = (report) => {
  // get the formatted date
  const today = todayDate();
  console.log(report);

  // configure email server
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_ADDR,
      pass: process.env.EMAIL_PW,
    },
  });

  // setup mail params
  const mailOptions = {
    from: process.env.EMAIL_ADDR,
    to: process.env.RECIPIENT,
    subject: "Snipe Report: " + today,
    text: JSON.stringify(report, null, 2),
  };

  // send the email message
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
};

// Current Date Function
const todayDate = () => {
  const today = new Date();
  return today.toLocaleString("en-GB", { timeZone: "Asia/Singapore" });
};
