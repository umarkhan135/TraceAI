def max_of_two(a, b):
    """
    Calculate the maximum of two numbers.

    Args:
        a: First number
        b: Second number

    Returns:
        The maximum of the two numbers
    """
    return a if a > b else b


if __name__ == "__main__":
    # Example usage
    num1 = 10
    num2 = 25

    result = max_of_two(num1, num2)
    print(f"The maximum of {num1} and {num2} is: {result}")

    # Test with negative numbers
    num3 = -5
    num4 = -15
    result2 = max_of_two(num3, num4)
    print(f"The maximum of {num3} and {num4} is: {result2}")
