def multiply_numbers(a, b):
    """
    Multiply two numbers together and return the result.

    Args:
        a: First number
        b: Second number

    Returns:
        The product of a and b
    """
    return a * b


if __name__ == "__main__":
    # Test the function
    num1 = 5
    num2 = 10
    result = multiply_numbers(num1, num2)
    print(f"The product of {num1} and {num2} is: {result}")
