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
    print(divide(10, 2))  # 5.0
    print(divide(15, 3))  # 5.0
    print(divide(7, 2))   # 3.5
