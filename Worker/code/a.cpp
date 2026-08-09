#include <iostream>

unsigned long long factorial(int n) {
    unsigned long long result = 1;
    for (int i = 2; i <= n; ++i) result *= i;
    return result;
}

int main() {
    for (int n = 0; n <= 10; ++n)
        std::cout << n << "! = " << factorial(n) << "\n";
    return 0;
}