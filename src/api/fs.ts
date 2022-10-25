import fs from 'fs';
import path from 'path';

// Check is file exists
export const isFileExists = (
  filePath: string
): Promise<boolean> => new Promise(
  (resolve) => {

    fs.access(
      filePath,
      fs.constants.F_OK,
      error => {
        if (error) {
          return resolve(false);
        }
        resolve(true);
      }
    )
  }
);

// Reads file
export const read = <T = string>(
  basePath: string,
  filePath: string,
  isJson = false
): Promise<T> => new Promise(
  (resolve, reject) => {
    const savedFilePath = path.resolve(basePath, filePath)

    if (!isFileExists(savedFilePath)) {
      throw new Error(`File ${savedFilePath} not found or not readable`);
    }

    fs.readFile(
      savedFilePath,
      {
        encoding: 'utf8',
        flag: 'r'
      },
      (error, data) => {
        if (error) {
          return reject(error);
        }

        data = data.trim();

        if (isJson) {
          // Trying to parse the payload
          try {
            data = JSON.parse(data);
          } catch (error) {
            throw new Error(
              `Unable to parse from the payload as JSON by path ${filePath}`
            );
          }
        }

        resolve(data as T);
      }
    );
  }
);

// Writes file
export const write = (
  basePath: string,
  filePath: string,
  fileContent: string
): Promise<string> => new Promise(
  (resolve, reject) => {

    const savedFilePath = path.resolve(basePath, filePath);

    fs.writeFile(
      savedFilePath,
      fileContent,
      {
        encoding: 'utf8',
        flag: 'w'
      },
      error => {
        if (error) {
          return reject(error);
        }
        resolve(savedFilePath);
      }
    );
  }
);

// Create a directory is not exists
export const createDir = (
  basePath: string,
  dir: string
): Promise<void> => new Promise(
  (resolve, reject) => {

    const dirPath = path.resolve(basePath, dir);

    fs.mkdir(
      dirPath,
      {
        recursive: true
      },
      error => {
        if (error) {
          return reject(error);
        }
        resolve();
      }
    )
  }
);

