import _ from 'lodash';
import moment from 'moment';
import fs from 'fs';
import Web3 from 'web3';
import inquirer from 'inquirer';
import Promise from 'bluebird';
import FastCsv from 'fast-csv';
import BigNumber from 'bignumber.js';

import config from './config';
import logger from './logger';

const {
  defaultInputPath,
  outputFolder,
  ethAccountPrivateKey,
  ethAccountPassword,
  // parityEndpoint,
  parityEndpointRopsten,
  maxGasCost,
} = config;

const output = [];
// const web3 = new Web3(new Web3.providers.HttpProvider(parityEndpoint));
const web3 = new Web3(new Web3.providers.HttpProvider(parityEndpointRopsten));

function checkWeb3Connection() {
  return web3.eth.getBlockNumber().then((result) => {
    logger.success(`Connected to ETH node; current ETH block number ${result} ...`);
  }, (err) => {
    throw new Error('Unable to connect to ETH node', err);
  });
}

function openAndParseListFile(filepath) {
  logger.info(`Opening file from path ${filepath}`);
  const results = [];

  const stream = fs.createReadStream(filepath);
  const deferred = Promise.defer();

  const csvStream = FastCsv({
    trim: true,
    delimiter: '\t',
  })
    .on('data', (data) => {
      // Skip comment
      if (_.startsWith(data, '#')) {
        return;
      }

      // There should be four columns in the list
      const len = data.length;
      if (len !== 4) {
        throw new Error(`Invalid count of column of csv file. Expected 4; Actual ${len}`);
      }

      const name = data[0];
      const address = _.toLower(data[1]);

      if (!web3.utils.isAddress(address)) {
        throw new Error(`Invalid ETH Address ${address}`);
      }

      const amount = new BigNumber(data[2]);
      const type = data[3];

      results.push({
        name,
        address,
        amount,
        type,
      });
    })
    .on('end', () => {
      deferred.resolve(results);
    });

  logger.info('Parsing CSV file ...');
  stream.pipe(csvStream);

  return deferred.promise;
}

function transfer(accObj, address, amount, type) {
  logger.info(`Sending ${amount} ${type} from ${accObj.address} to ${address}`);

  const transactionObject = {
    from: accObj.address,
    to: address,
    value: web3.utils.toWei(amount.toString(), 'ether'),
  };

  return web3.eth.estimateGas(transactionObject).then((gas) => {
    transactionObject.gas = gas;
    return web3.eth.getGasPrice();
  })
    .then((gasPrice) => {
      const gasCost = web3.utils.fromWei(_.toString(transactionObject.gas * gasPrice), 'ether');
      logger.warn('Gas Cost: ', gasCost);

      if (gasCost > maxGasCost) {
        throw new Error(`Gas cost ${gasCost} is higher than ${maxGasCost}\n You can either 1. Increase ${maxGasCost} in src/config.js or 2. Wait for a quiet time to run again.`);
      }

      return accObj.signTransaction(transactionObject);
    })
    .then(result => (web3.eth.sendSignedTransaction(result.rawTransaction)
      .on('receipt', (receipt) => {
        const item = _.find(output, { address: receipt.to });
        item.txHash = receipt.transactionHash;
        item.status = 'success';
        logger.success(`Send success. transactionHash: ${receipt.transactionHash}`);
      })));
}

function batchTransfer(list) {
  // Setinel check
  logger.info('Starting batch Transfer ...');
  let total = new BigNumber(0);

  _.each(list, (item) => {
    total = total.plus(item.amount);
  });

  const { type } = list[0];

  return inquirer.prompt({
    type: 'confirm',
    name: 'start',
    message: `Are you sure to transfer ${total} ${type} to ${list.length} addresses?`,
  })
    .then((answers) => {
      if (answers.start) {
        const keystore = web3.eth.accounts.encrypt(ethAccountPrivateKey, ethAccountPassword);
        const decryptedAccount = web3.eth.accounts.decrypt(keystore, ethAccountPassword);

        return web3.eth.getBalance(decryptedAccount.address).then((result) => {
          const balance = web3.utils.fromWei(result, 'ether');
          logger.success(`Account ${decryptedAccount.address}'s balance is ${balance}`);

          if (balance < total) {
            throw new Error(`Insufficient balance ${balance}; less than ${total}`);
          }

          // Push items from input array into output
          _.each(list, (item) => {
            output.push(item);
          });
        })
          .then(() => (Promise.each(list, item => (transfer(decryptedAccount, item.address, item.amount, item.type)))));
      }
      throw new Error('Batch Transfer termintated ...');
    });
}

function flushLogs() {
  logger.info('Flushing logs ...');
  const filename = `log_${moment().format()}`;
  const deferred = Promise.defer();

  const formattedOutput = _.map(output, item => (JSON.stringify(item)));

  fs.writeFile(`${outputFolder}/${filename}`, formattedOutput, (err) => {
    if (err) {
      deferred.reject(err);
    }

    deferred.resolve();
  });

  return deferred.promise;
}

function main() {
  checkWeb3Connection()
    .then(() => (inquirer.prompt({
      type: 'input',
      name: 'filepath',
      message: 'What\'s list file path?',
      default: defaultInputPath,
    })))
    .then(answers => (openAndParseListFile(answers.filepath)))
    .then(list => (batchTransfer(list)))
    .then(() => (flushLogs()))
    .then(() => (inquirer.prompt([
      {
        type: 'confirm',
        name: 'exit',
        message: 'Do you want to exit (type No to continue)?',
        default: true,
      },
    ])))
    .then((answers) => {
      if (answers.exit) {
        logger.info('Terminating program, good luck!');
      } else {
        main();
      }
    }, (err) => {
      logger.error(err);
      logger.error('Terminating Program ...');
    });
}

function CreateAccount() {
  const newAccount = web3.eth.accounts.create();
  console.log(newAccount);
  web3.eth.accounts.wallet.add(newAccount);
  console.log(web3.eth.accounts.wallet);
}

function test() {
  // CreateAccount();
  // const importedAccount = web3.eth.accounts.privateKeyToAccount('31bc5318a5b7bb796b90766b73b7bb5103392a0d6d723eb0923317e132603e75');
  // console.log('importedAccount', importedAccount);
  // web3.eth.accounts.wallet.add(importedAccount);

  const password = 'lq870807';
  const privateKey = '31bc5318a5b7bb796b90766b73b7bb5103392a0d6d723eb0923317e132603e75';

  web3.eth.getBalance('0x2d2970CCFD339d13A313021d5ffc6590a2412680').then((result) => {
    console.log('balance', result);
    return transfer(decryptedAccount, '0x22903DfbF50CB59f1c3897fA044a73524f44168d', new BigNumber(0.01), 'ether');
  });

  // web3.eth.getTransaction('0x84d6ab271030c7ee346dde765f56de279a11bb71aac7232d8ee222b5f37bc3da').then(console.log);
}

main();

// test();
