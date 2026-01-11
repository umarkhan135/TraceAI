def divide(a, b, c):
    """
    Divides three numbers sequentially (a / b / c).

    Args:
        a: The first number (dividend)
        b: The second number (first divisor)
        c: The third number (second divisor)

    Returns:
        The result of a divided by b divided by c

    Raises:
        ValueError: If b or c is zero
    """
    if b == 0 or c == 0:
        raise ValueError("Cannot divide by zero")
    return a / b / c


if __name__ == "__main__":
    # Example usage
    print(f"24 / 2 / 3 = {divide(24, 2, 3)}")
    print(f"100 / 5 / 2 = {divide(100, 5, 2)}")
    print(f"60 / 3 / 4 = {divide(60, 3, 4)}")

    # This will raise an error
    try:
        print(f"10 / 0 / 5 = {divide(10, 0, 5)}")
    except ValueError as e:
        print(f"Error: {e}")
