def add_numbers(a, b):
    """
    Add two numbers together and return the result.

    Args:
        a: First number
        b: Second number

    Returns:
        The sum of a and b
    """
    return a + b


if __name__ == "__main__":
    # Test the function
    num1 = 5
    num2 = 10
    result = add_numbers(num1, num2)
    print(f"The sum of {num1} and {num2} is: {result}")
