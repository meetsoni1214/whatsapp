import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  loginInputSchema,
  registerInputSchema,
  type LoginInput,
  type RegisterInput,
} from '@event-chat/contracts';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { Environment } from '../../config/environment';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerInputSchema)) input: RegisterInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.register(input);
    this.setRefreshCookie(
      response,
      session.refreshToken,
      session.refreshExpiresAt,
    );
    return session.body;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginInputSchema)) input: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(input);
    this.setRefreshCookie(
      response,
      session.refreshToken,
      session.refreshExpiresAt,
    );
    return session.body;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const session = await this.auth.refresh(
        request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
      );
      this.setRefreshCookie(
        response,
        session.refreshToken,
        session.refreshExpiresAt,
      );
      return session.body;
    } catch (error) {
      response.clearCookie(REFRESH_TOKEN_COOKIE, this.cookieOptions());
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(
      request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined,
    );
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.cookieOptions());
  }

  private setRefreshCookie(
    response: Response,
    token: string,
    expires: Date,
  ): void {
    response.cookie(REFRESH_TOKEN_COOKIE, token, {
      ...this.cookieOptions(),
      expires,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: '/api/v1/auth',
    };
  }
}
