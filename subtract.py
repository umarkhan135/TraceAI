def subtract(a, b):
    """
    Subtract b from a and return the result.

    Args:
        a: The first number (minuend)
        b: The second number (subtrahend)

    Returns:
        The difference (a - b)
    """
    return a - b


if __name__ == "__main__":
    # Example usage
    result = subtract(10, 3)
    print(f"10 - 3 = {result}")

    result = subtract(5.5, 2.3)
    print(f"5.5 - 2.3 = {result}")
