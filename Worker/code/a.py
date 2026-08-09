function factorial(n) {
  let result = 1;
  for (let i = 2n; i <= BigInt(n); i++) result *= i;
  return result;
}

for (let n = 0; n <= 10; n++) {
  console.log(`${n}! = ${factorial(n)}`);
}