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
