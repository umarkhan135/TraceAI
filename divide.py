def divide(a, b):
    """Divide two numbers.

    Args:
        a: The numerator
        b: The denominator

    Returns:
        The result of a divided by b

    Raises:
        ValueError: If b is zero
    """
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b


if __name__ == "__main__":
    # Example usage
    result = divide(10, 2)
    print(f"10 / 2 = {result}")

    result = divide(15, 3)
    print(f"15 / 3 = {result}")

    result = divide(7, 2)
    print(f"7 / 2 = {result}")
