from setuptools import setup, find_packages

setup(
    name="traceai",
    version="0.1.0",
    description="LLM-native code provenance and PR review tool",
    author="TraceAI Team",
    packages=find_packages(),
    install_requires=[
        "gitpython>=3.1.40",
        "PyGithub>=2.1.1",
        "pydantic>=2.5.0",
        "click>=8.1.7",
        "rich>=13.7.0",
        "python-dateutil>=2.8.2",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.3",
            "pytest-cov>=4.1.0",
            "black>=23.12.0",
            "mypy>=1.7.1",
            "ruff>=0.1.9",
        ],
        "ai": [
            "anthropic>=0.18.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "traceai=traceai.cli:main",
        ],
    },
    python_requires=">=3.11",
)
