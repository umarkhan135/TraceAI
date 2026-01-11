def divide(a, b):
    """
    Divides two numbers.

    Args:
        a: The dividend (number to be divided)
        b: The divisor (number to divide by)

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
    print(f"10 / 2 = {divide(10, 2)}")
    print(f"15 / 3 = {divide(15, 3)}")
    print(f"7 / 2 = {divide(7, 2)}")

    # This will raise an error
    try:
        print(f"5 / 0 = {divide(5, 0)}")
    except ValueError as e:
        print(f"Error: {e}")
