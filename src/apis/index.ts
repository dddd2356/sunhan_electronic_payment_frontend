import axios, {AxiosResponse} from "axios";
import {
  SignInRequestDto,
} from "./request/auth";

import {ResponseDto} from "./response";
import {SignInResponseDto} from "./response/auth";

const responseHandler = <T>(response: AxiosResponse<any,any>) =>{
    const responseBody: T = response.data;
    return responseBody;
};

const errorHandler = (error: any) => {
    if(!error.response || !error.response.data) return null;
    const responseBody: ResponseDto = error.response.data;
    return responseBody;
}

const DOMAIN = 'http://localhost:8080';

const API_DOMAIN = `${DOMAIN}/api/v1`;

const SIGN_IN_URL = () => `${API_DOMAIN}/auth/sign-in`;

export const signInRequest = async (requestBody: SignInRequestDto)=> {
    const result = await axios.post(SIGN_IN_URL(), requestBody)
        .then(responseHandler<SignInResponseDto>)
        .catch(errorHandler)
    return result;
}


