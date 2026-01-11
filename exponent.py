def calculate_exponent(base, exponent):
    """
    Calculate base raised to the power of exponent (base^exponent).

    Args:
        base: The base number
        exponent: The power to raise the base to

    Returns:
        The result of base^exponent
    """
    return base ** exponent


if __name__ == "__main__":
    # Example usage
    a = 2
    b = 3
    result = calculate_exponent(a, b)
    print(f"{a}^{b} = {result}")

    # More examples
    print(f"5^2 = {calculate_exponent(5, 2)}")
    print(f"10^3 = {calculate_exponent(10, 3)}")
    print(f"2^10 = {calculate_exponent(2, 10)}")
