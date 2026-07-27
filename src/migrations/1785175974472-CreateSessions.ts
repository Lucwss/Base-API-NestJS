import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSessions1785175974472 implements MigrationInterface {
  name = 'CreateSessions1785175974472';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tokenHash" character varying NOT NULL, "userId" uuid NOT NULL, "userAgent" character varying(512), "ip" character varying(64), "expires" TIMESTAMP, "created" TIMESTAMP NOT NULL DEFAULT now(), "updated" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bace6c68efc156fddac9b14bda" ON "sessions"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_57de40bc620f456c7311aa3a1e" ON "sessions"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_57de40bc620f456c7311aa3a1e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bace6c68efc156fddac9b14bda"`,
    );
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
