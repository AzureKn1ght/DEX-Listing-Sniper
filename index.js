const FactoryABI = require("./ABI/FactoryABI");
const RouterABI = require("./ABI/RouterABI");
const erc20ABI = require("./ABI/erc20ABI");
const nodemailer = require("nodemailer");
const { ethers } = require("ethers");
require("dotenv").config();

const addresses = {
  BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
  router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  token: "0xf9eC2B8FfB7A9aCA3b142939a63Fd5572CD3a308",
};

var report = [];
const wallet = {
  address: process.env.ADR,
  key: process.env.PVK,
};

// new RPC connection
const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
const account = new ethers.Wallet(wallet.key, provider);
console.log(account);

// contract details
const factory = new ethers.Contract(addresses.factory, FactoryABI, account);
const router = new ethers.Contract(addresses.router, RouterABI, account);
const busd = new ethers.Contract(addresses.BUSD, erc20ABI, account);

factory.on("PairCreated", async (token0, token1, pairAddress) => {
  //The quote currency needs to be BUSD (we will pay with BUSD)
  let tokenIn, tokenOut;
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
  sendReport(report);

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
      wallet.address,
      Date.now() + 1000 * 60 * 10 //10 minutes
    );

    const receipt = await tx.wait();
    console.log("Transaction receipt");
    console.log(receipt);

    report.push(receipt.toString());

    sendReport(report);
    return true;
  } catch (error) {
    // failed disconnect
    console.error(error);
    console.log("Buying Failed!");
    console.log("retrying...");

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
