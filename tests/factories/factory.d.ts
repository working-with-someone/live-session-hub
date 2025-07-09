// IFactory.ts
export interface IFactory<CreateInput, Model> {
  /**
   * 단일 랜덤 인스턴스 생성 (DB에 저장하지 않음)
   * @param overrides - 오버라이드할 필드 값
   * @returns 생성된 데이터 객체
   */
  create(overrides?: Partial<CreateInput>): CreateInput;

  /**
   * 단일 랜덤 인스턴스 생성 및 DB에 저장
   * @param overrides - 오버라이드할 필드 값
   * @returns 저장된 데이터 객체
   */
  createAndSave(overrides?: Partial<CreateInput>): Promise<Model>;

  /**
   * 여러 개의 랜덤 인스턴스 생성 (DB에 저장하지 않음)
   * @param options - 오버라이드 필드 값 및 생성 개수
   * @returns 생성된 데이터 객체 배열
   */
  createMany(options?: {
    overrides?: Partial<CreateInput>;
    count?: number;
  }): CreateInput[];

  /**
   * 여러 개의 랜덤 인스턴스 생성 및 DB에 저장
   * @param options - 오버라이드 필드 값 및 생성 개수
   * @returns 저장된 데이터 객체 배열
   */
  createManyAndSave(options?: {
    overrides?: Partial<CreateInput>;
    count?: number;
  }): Promise<Model[]>;

  /**
   * 생성된 인스턴스 정리 (예: DB 초기화)
   */
  cleanup(): Promise<void>;
}
