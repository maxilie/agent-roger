"""
BEFORE RUNNING THE SCRIPT LOCALLY, MAKE SURE THAT:

1. If you are using Apple silicon, make sure your python installation supports ARM:
wget https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-MacOSX-arm64.sh
bash Miniforge3-MacOSX-arm64.sh

2. Install llama-cpp-python with Metal backend:
CMAKE_ARGS="-DLLAMA_METAL=on" FORCE_CMAKE=1 pip install --upgrade --force-reinstall llama-cpp-python --no-cache-dir
"""

# LOAD MODEL
print('Ensuring that the Metal backend is installed...')
from llama_cpp import Llama
import time
model = "/Users/maxilie/Desktop/dolphin-2.6-mixtral-8x7b.Q3_K_M.gguf"
context = 8000
print(f'Loading model from {model}')
load_start_time = time.time()
llm = Llama(model_path=model, 
            n_ctx=context, 
            n_batch=512, 
            verbose=True, 
            seed=669, 
            use_mlock=True,
            n_threads=8, 
            n_threads_batch=8)
load_end_time = time.time()
formatted_time = "{:,}".format(int(load_end_time - load_start_time))
print(f'Loaded model in {formatted_time} seconds')
print('')
print(f'model threads: {llm.n_threads} | batch threads: {llm.n_threads_batch}')
print('')

# TEST INFERENCE
system = """
You are a helpful assistant who can answer any question succinctly but thoroughly and expertly
"""

user = """
Summarize the following passage: To explore the history of the universe, we will follow the same path that astronomers followed historically—beginning with studies of the nearby universe and then probing ever-more-distant objects and looking further back in time.The realization that the universe changes with time came in the 1920s and 1930s when measurements of the redshifts of a large sample of galaxies became available. With hindsight, it is surprising that scientists were so shocked to discover that the universe is expanding. In fact, our theories of gravity demand that the universe must be either expanding or contracting. To show what we mean, let’s begin with a universe of finite size—say a giant ball of a thousand galaxies. All these galaxies attract each other because of their gravity. If they were initially stationary, they would inevitably begin to move closer together and eventually collide. They could avoid this collapse only if for some reason they happened to be moving away from each other at high speeds. In just the same way, only if a rocket is launched at high enough speed can it avoid falling back to Earth.The problem of what happens in an infinite universe is harder to solve
"""

message = f"<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n"
load_start_time = time.time()
output = llm(message, 
             echo=False, 
             stream=False, 
             max_tokens=context, 
             stop=['<|im_end|>'])
load_end_time = time.time()
formatted_time = "{:,}".format(int(load_end_time - load_start_time))
print(f'Generated output in {formatted_time} seconds')
print('')
print('stats:')
print(output['usage'])
response = output['choices'][0]['text'].replace(message, '')
print('response: ')
print(response)

# Run the script OUTSIDE of your editor's terminal:
# python3 test-inference.py